require "open3"
require "tempfile"

# Local, offline text-to-speech via Piper (https://github.com/rhasspy/piper).
# Runs entirely on the server — no external API, no cost, works even without
# internet access. Used as a free alternative to ElevenLabs for pt-BR narration.
class PiperTtsService
  class Error < StandardError; end

  PIPER_BIN  = Rails.root.join("vendor", "piper", "piper").to_s
  VOICES_DIR = Rails.root.join("vendor", "piper", "voices").to_s
  DEFAULT_VOICE = "pt_BR-faber-medium"

  VOICES = [
    { id: "pt_BR-faber-medium",    name: "Faber (padrão)" },
    { id: "pt_BR-cadu-medium",     name: "Cadu" },
    { id: "pt_BR-jeff-medium",     name: "Jeff" },
    { id: "pt_BR-edresson-low",    name: "Edresson" },
  ].freeze

  def self.available?
    File.executable?(PIPER_BIN) && File.exist?(model_path(DEFAULT_VOICE))
  end

  def self.model_path(voice)
    Rails.root.join("vendor", "piper", "voices", "#{voice}.onnx")
  end

  # Only allow voice ids we shipped ourselves — never build a path from
  # unsanitized user input.
  def self.resolve_voice(voice)
    VOICES.find { |v| v[:id] == voice.to_s }&.fetch(:id) || DEFAULT_VOICE
  end

  def self.synthesize(text, voice: DEFAULT_VOICE)
    raise Error, "Piper TTS não está instalado neste servidor (rode bin/download_piper)" unless available?

    model = model_path(resolve_voice(voice))
    raise Error, "Voz #{voice} não encontrada (rode bin/download_piper)" unless File.exist?(model)

    Tempfile.create(["piper", ".wav"]) do |wav|
      _stdout, stderr, status = Open3.capture3(
        PIPER_BIN, "--model", model.to_s, "--output_file", wav.path,
        stdin_data: text.to_s
      )
      raise Error, "Piper falhou: #{stderr.presence || 'erro desconhecido'}" unless status.success?

      File.binread(wav.path)
    end
  end
end
