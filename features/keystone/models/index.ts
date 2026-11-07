import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'

export const models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platform,
}

export default models
