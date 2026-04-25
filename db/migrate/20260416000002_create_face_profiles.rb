class CreateFaceProfiles < ActiveRecord::Migration[8.1]
  def change
    create_table :face_profiles do |t|
      t.references :user,       null: false, foreign_key: true
      t.string  :nickname,      null: false
      t.text    :descriptor,    null: false  # JSON array of 128 floats
      t.text    :characteristics               # JSON: age, gender, etc.
      t.string  :thumbnail                     # small base64 crop
      t.datetime :last_seen_at
      t.integer  :seen_count,   default: 1
      t.timestamps
    end
  end
end
