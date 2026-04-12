module Api
  class MessagesController < ApplicationController
    protect_from_forgery with: :null_session

    def create
      @session = ChatSession.find(params[:session_id])
      @message = @session.messages.create!(
        role:           params.dig(:message, :role),
        content:        params.dig(:message, :content),
        emotion_points: params.dig(:message, :emotion_points),
        stamina:        params.dig(:message, :stamina)
      )
      render json: { id: @message.id }, status: :created
    end
  end
end
