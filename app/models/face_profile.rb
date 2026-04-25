class FaceProfile < ApplicationRecord
  belongs_to :user

  validates :nickname,   presence: true
  validates :descriptor, presence: true

  def descriptor_array
    JSON.parse(descriptor)
  rescue JSON::ParserError
    []
  end

  def characteristics_hash
    JSON.parse(characteristics || '{}')
  rescue JSON::ParserError
    {}
  end
end
