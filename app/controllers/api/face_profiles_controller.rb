module Api
  class FaceProfilesController < ApplicationController
    protect_from_forgery with: :null_session

    def index
      profiles = current_user.face_profiles.order(updated_at: :desc)
      render json: profiles.map { |p| serialize(p) }
    end

    def create
      desc = params[:descriptor]
      desc = desc.to_json if desc.is_a?(Array)
      chars = params[:characteristics]
      chars = chars.to_json if chars.is_a?(Hash)

      profile = current_user.face_profiles.build(
        nickname:        params[:nickname],
        descriptor:      desc,
        characteristics: chars,
        thumbnail:       params[:thumbnail],
        last_seen_at:    Time.current
      )
      if profile.save
        render json: serialize(profile), status: :created
      else
        render json: { error: profile.errors.full_messages.join(', ') }, status: :unprocessable_entity
      end
    end

    def update
      profile = current_user.face_profiles.find(params[:id])
      attrs   = { last_seen_at: Time.current, seen_count: profile.seen_count + 1 }
      attrs[:nickname]        = params[:nickname]               if params[:nickname].present?
      attrs[:characteristics] = params[:characteristics].to_json if params[:characteristics].present?
      profile.update!(attrs)
      render json: serialize(profile)
    end

    def destroy
      current_user.face_profiles.find(params[:id]).destroy
      render json: { ok: true }
    end

    private

    def serialize(p)
      {
        id:              p.id,
        nickname:        p.nickname,
        descriptor:      p.descriptor_array,
        characteristics: p.characteristics_hash,
        last_seen_at:    p.last_seen_at,
        seen_count:      p.seen_count
      }
    end
  end
end
