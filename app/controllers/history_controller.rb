class HistoryController < ApplicationController
  def index
    @sessions = ChatSession.recent.includes(:messages)
  end

  def show
    @session  = ChatSession.includes(:messages).find(params[:id])
    @messages = @session.messages.chronological
  end

  def export
    @session  = ChatSession.includes(:messages).find(params[:id])
    exporter  = ChatLogExporter.new(@session)
    filename  = "amic-sessao-#{@session.id}-#{@session.created_at.strftime('%Y%m%d')}.txt"
    send_data exporter.content,
              filename:    filename,
              type:        'text/plain; charset=utf-8',
              disposition: 'attachment'
  end

  def analyze
    @session = ChatSession.includes(:messages).find(params[:id])

    api_key = Setting.get("api_key")
    if api_key.blank?
      render json: { error: "Chave da API não configurada. Acesse /app_settings." }, status: :unprocessable_entity
      return
    end

    result = ClaudeService.new(api_key).analyze_conversation(@session)

    if result[:error]
      render json: { error: result[:error] }, status: :unprocessable_entity
    else
      render json: result
    end
  end
end
