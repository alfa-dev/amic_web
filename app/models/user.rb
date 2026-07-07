class User < ApplicationRecord
  has_secure_password
  has_many :chat_sessions, dependent: :nullify
  has_many :face_profiles,  dependent: :destroy
  has_one  :amic_state,     dependent: :destroy

  validates :name,  presence: true
  validates :email, presence: true, uniqueness: { case_sensitive: false },
                    format: { with: URI::MailTo::EMAIL_REGEXP }
  validates :password, length: { minimum: 6 }, allow_nil: true

  before_save { email.downcase! }
end
