require "net/http"
require "json"

class ClaudeService
  API_URL = "https://api.anthropic.com/v1/messages"
  MODEL   = "claude-sonnet-4-20250514"

  def initialize(api_key)
    @api_key = api_key
  end

  def analyze_conversation(session)
    messages = session.messages.chronological

    if messages.empty?
      return { error: "Sessão sem mensagens para analisar." }
    end

    transcript = messages.map do |m|
      role = m.role == "user" ? "Usuário" : "Amic"
      emotion_info = m.emotion_points ? " [emoção: #{m.emotion_points}, stamina: #{m.stamina}]" : ""
      "#{role}#{emotion_info}: #{m.content}"
    end.join("\n")

    duration = session.duration_minutes ? "#{session.duration_minutes} minutos" : "duração desconhecida"

    system_prompt = <<~PROMPT
      Você é um analista de conversas. Analise a transcrição abaixo de uma sessão entre um usuário e Amic, um robô virtual com emoções.
      Seja direto, perspicaz e útil. Responda em português brasileiro.
    PROMPT

    user_prompt = <<~PROMPT
      Sessão de #{duration}, iniciada em #{session.created_at.strftime('%d/%m/%Y às %H:%M')}.
      Emoção inicial do Amic: #{session.emotion_start || 50}/100
      Emoção final do Amic: #{session.emotion_end || '?'}/100

      Transcrição completa:
      #{transcript}

      Analise esta conversa e responda em JSON com exatamente esta estrutura:
      {
        "resumo": "2-3 frases resumindo o que aconteceu na conversa",
        "topicos": ["tópico 1", "tópico 2"],
        "arco_emocional": "descreva como a emoção do Amic evoluiu e por quê",
        "perfil_usuario": "o que você percebeu sobre o comportamento e intenções do usuário",
        "aprendizados": ["o que Amic aprendeu ou deveria ter aprendido nesta conversa"],
        "qualidade": "avaliação da qualidade da interação (1-10) com justificativa",
        "padroes": "padrões interessantes ou anomalias observadas",
        "sugestoes": ["sugestão 1 para melhorar futuras conversas"]
      }
    PROMPT

    response = call_api(system_prompt, user_prompt)
    parse_json_response(response)
  end

  private

  def call_api(system_prompt, user_prompt)
    uri  = URI(API_URL)
    http = Net::HTTP.new(uri.host, uri.port)
    http.use_ssl = true
    http.read_timeout = 30

    request = Net::HTTP::Post.new(uri)
    request["Content-Type"]      = "application/json"
    request["x-api-key"]         = @api_key
    request["anthropic-version"] = "2023-06-01"

    request.body = {
      model:      MODEL,
      max_tokens: 1024,
      system:     system_prompt,
      messages:   [{ role: "user", content: user_prompt }]
    }.to_json

    response = http.request(request)
    JSON.parse(response.body)
  end

  def parse_json_response(api_response)
    return { error: api_response.dig("error", "message") || "Erro na API" } if api_response["error"]

    text = api_response.dig("content", 0, "text") || ""
    json_match = text.match(/\{[\s\S]*\}/)
    return { error: "Resposta inválida da API" } unless json_match

    JSON.parse(json_match[0]).transform_keys(&:to_sym)
  rescue JSON::ParserError
    { error: "Não foi possível interpretar a análise." }
  end
end
