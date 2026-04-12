class CreateChatSessions < ActiveRecord::Migration[8.1]
  def change
    create_table :chat_sessions do |t|
      t.string :robot_name
      t.integer :emotion_start
      t.integer :emotion_end
      t.integer :stamina_start
      t.integer :stamina_end
      t.datetime :ended_at

      t.timestamps
    end
  end
end
