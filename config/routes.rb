Rails.application.routes.draw do
  root 'home#index'
  get  '/settings', to: 'home#settings', as: :settings

  resources :history, only: [:index, :show] do
    member do
      post :analyze
      get  :export
    end
  end

  resources :app_settings, only: [:index, :update]

  namespace :api do
    resources :sessions, only: [:create, :update] do
      resources :messages, only: [:create]
    end
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
