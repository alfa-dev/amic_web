module Api
  class AmicStatesController < ApplicationController
    protect_from_forgery with: :null_session

    def show
      s = current_user.amic_state
      render json: {
        state_data:   s ? safe_parse(s.state_data)   : nil,
        code_library: s ? safe_parse(s.code_library) : nil,
      }
    end

    def update
      raw  = JSON.parse(request.raw_post)
      rec  = current_user.amic_state || current_user.build_amic_state

      rec.state_data   = raw['state_data'].to_json   if raw.key?('state_data')
      rec.code_library = raw['code_library'].to_json if raw.key?('code_library')

      rec.save!
      head :ok
    rescue JSON::ParserError
      render json: { error: 'invalid json' }, status: :bad_request
    end

    private

    def safe_parse(text)
      text ? JSON.parse(text) : nil
    rescue JSON::ParserError
      nil
    end
  end
end
