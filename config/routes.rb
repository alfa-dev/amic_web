Rails.application.routes.draw do
  root 'home#index'
  get  '/settings', to: 'home#settings', as: :settings

  # Auth
  get    '/login',    to: 'sessions#new',       as: :login
  post   '/login',    to: 'sessions#create',    as: :session
  delete '/logout',   to: 'sessions#destroy',   as: :logout
  get    '/signup',   to: 'registrations#new',  as: :signup
  post   '/signup',   to: 'registrations#create'

  resources :history, only: [:index, :show] do
    member do
      post :analyze
      get  :export
    end
  end

  resources :app_settings, only: [:index, :update]

  namespace :api do
    resource  :amic_state,   only: [:show, :update]
    resources :sessions, only: [:create, :update] do
      resources :messages, only: [:create]
    end
    resources :face_profiles, only: [:index, :create, :update, :destroy]
  end

  get "up" => "rails/health#show", as: :rails_health_check
end
