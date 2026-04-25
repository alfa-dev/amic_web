# This file is auto-generated from the current state of the database. Instead
# of editing this file, please use the migrations feature of Active Record to
# incrementally modify your database, and then regenerate this schema definition.
#
# This file is the source Rails uses to define your schema when running `bin/rails
# db:schema:load`. When creating a new database, `bin/rails db:schema:load` tends to
# be faster and is potentially less error prone than running all of your
# migrations from scratch. Old migrations may fail to apply correctly if those
# migrations use external dependencies or application code.
#
# It's strongly recommended that you check this file into your version control system.

ActiveRecord::Schema[8.1].define(version: 2026_04_16_000003) do
  create_table "chat_sessions", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.integer "emotion_end"
    t.integer "emotion_start"
    t.datetime "ended_at"
    t.string "robot_name"
    t.integer "stamina_end"
    t.integer "stamina_start"
    t.datetime "updated_at", null: false
    t.integer "user_id"
    t.index ["user_id"], name: "index_chat_sessions_on_user_id"
  end

  create_table "face_profiles", force: :cascade do |t|
    t.text "characteristics"
    t.datetime "created_at", null: false
    t.text "descriptor", null: false
    t.datetime "last_seen_at"
    t.string "nickname", null: false
    t.integer "seen_count", default: 1
    t.string "thumbnail"
    t.datetime "updated_at", null: false
    t.integer "user_id", null: false
    t.index ["user_id"], name: "index_face_profiles_on_user_id"
  end

  create_table "messages", force: :cascade do |t|
    t.integer "chat_session_id", null: false
    t.text "content"
    t.datetime "created_at", null: false
    t.integer "emotion_points"
    t.string "role"
    t.integer "stamina"
    t.datetime "updated_at", null: false
    t.index ["chat_session_id"], name: "index_messages_on_chat_session_id"
  end

  create_table "settings", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "key"
    t.datetime "updated_at", null: false
    t.text "value"
  end

  create_table "users", force: :cascade do |t|
    t.datetime "created_at", null: false
    t.string "email", null: false
    t.string "name", null: false
    t.string "password_digest", null: false
    t.datetime "updated_at", null: false
    t.index ["email"], name: "index_users_on_email", unique: true
  end

  add_foreign_key "chat_sessions", "users"
  add_foreign_key "face_profiles", "users"
  add_foreign_key "messages", "chat_sessions"
end
