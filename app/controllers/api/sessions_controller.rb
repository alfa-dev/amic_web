module Api
  class SessionsController < ApplicationController
    protect_from_forgery with: :null_session

    def create
      @session = ChatSession.create!(
        robot_name:    params.dig(:session, :robot_name) || 'Amic',
        emotion_start: params.dig(:session, :emotion_start) || 50,
        stamina_start: params.dig(:session, :stamina_start) || 100
      )
      render json: { id: @session.id }, status: :created
    end

    def update
      @session = ChatSession.find(params[:id])
      @session.update!(
        emotion_end: params.dig(:session, :emotion_end),
        stamina_end: params.dig(:session, :stamina_end),
        ended_at:    params.dig(:session, :ended_at) || Time.current
      )
      ChatLogExporter.export(@session.reload) rescue nil
      render json: { ok: true }
    end
  end
end
