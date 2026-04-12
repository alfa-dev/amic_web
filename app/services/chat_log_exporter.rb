class ChatLogExporter
  LOG_DIR = Rails.root.join('storage', 'chat_logs')

  def self.export(session)
    new(session).export
  end

  def initialize(session)
    @session  = session
    @messages = session.messages.chronological
  end

  def export
    FileUtils.mkdir_p(LOG_DIR)
    File.write(file_path, content, encoding: 'utf-8')
    file_path
  end

  def content
    lines = []
    lines << "SESSÃO ##{@session.id}"
    lines << "Robô: #{@session.robot_name || 'Amic'}"
    lines << "Data: #{@session.created_at.strftime('%d/%m/%Y às %H:%M')}"
    lines << "Duração: #{@session.duration_minutes ? "#{@session.duration_minutes} minutos" : 'em andamento'}"
    lines << "Emoção: #{@session.emotion_start || '?'} → #{@session.emotion_end || '?'}"
    lines << "Stamina: #{@session.stamina_start || '?'} → #{@session.stamina_end || '?'}"
    lines << "Mensagens: #{@messages.size}"
    lines << ''
    lines << '=' * 60
    lines << ''

    @messages.each do |msg|
      role  = msg.role == 'user' ? 'Usuário' : (@session.robot_name || 'Amic')
      time  = msg.created_at.strftime('%H:%M:%S')
      meta  = [ msg.emotion_points ? "emoção:#{msg.emotion_points}" : nil,
                msg.stamina        ? "stamina:#{msg.stamina}"        : nil ].compact.join(', ')

      lines << "[#{time}] #{role}#{meta.present? ? " (#{meta})" : ''}"
      lines << msg.content
      lines << ''
    end

    lines << '=' * 60
    lines.join("\n")
  end

  private

  def file_path
    LOG_DIR.join("sessao-#{@session.id}-#{@session.created_at.strftime('%Y%m%d-%H%M')}.txt")
  end
end
