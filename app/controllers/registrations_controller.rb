class RegistrationsController < ApplicationController
  skip_before_action :require_login

  def new; end

  def create
    @user = User.new(
      name:                  params[:name],
      email:                 params[:email],
      password:              params[:password],
      password_confirmation: params[:password_confirmation]
    )
    if @user.save
      session[:user_id] = @user.id
      redirect_to root_path
    else
      flash.now[:error] = @user.errors.full_messages.join(' · ')
      render :new, status: :unprocessable_entity
    end
  end
end
