module Api
  class TtsController < ApplicationController
    protect_from_forgery with: :null_session

    def piper
      text = params[:text].to_s.strip
      return render json: { error: "texto em branco" }, status: :bad_request if text.blank?

      audio = PiperTtsService.synthesize(text, voice: params[:voice])
      send_data audio, type: "audio/wav", disposition: "inline"
    rescue PiperTtsService::Error => e
      render json: { error: e.message }, status: :unprocessable_entity
    end
  end
end
