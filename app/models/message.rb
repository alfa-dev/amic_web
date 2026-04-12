class Message < ApplicationRecord
  belongs_to :chat_session

  validates :role, inclusion: { in: %w[user assistant] }
  validates :content, presence: true

  scope :chronological, -> { order(created_at: :asc) }
end
