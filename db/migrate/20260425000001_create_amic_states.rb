class CreateAmicStates < ActiveRecord::Migration[8.1]
  def change
    create_table :amic_states do |t|
      t.integer :user_id, null: false
      t.text :state_data
      t.text :code_library
      t.timestamps
    end
    add_index :amic_states, :user_id, unique: true
    add_foreign_key :amic_states, :users
  end
end
