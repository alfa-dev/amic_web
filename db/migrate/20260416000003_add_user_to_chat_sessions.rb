class AddUserToChatSessions < ActiveRecord::Migration[8.1]
  def change
    add_reference :chat_sessions, :user, foreign_key: true
  end
end
