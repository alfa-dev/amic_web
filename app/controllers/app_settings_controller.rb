class AppSettingsController < ApplicationController
  def index
    @api_key = Setting.get("api_key") || ""
  end

  def update
    Setting.set("api_key", params[:api_key].to_s.strip)
    redirect_to app_settings_index_path, notice: "Configurações salvas."
  end
end
