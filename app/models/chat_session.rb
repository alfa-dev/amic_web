class ChatSession < ApplicationRecord
  has_many :messages, dependent: :destroy

  scope :recent, -> { order(created_at: :desc) }

  def duration_minutes
    return nil unless ended_at
    ((ended_at - created_at) / 60).round
  end

  def emotion_label(points)
    case points
    when 80..100 then 'eufórico'
    when 60..79  then 'feliz'
    when 40..59  then 'neutro'
    when 20..39  then 'tristinho'
    else              'mal-humorado'
    end
  end
end
