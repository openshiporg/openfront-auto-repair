import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'
import * as policy from './policy'
import * as customers from './customers'
import * as scheduling from './scheduling'

export const models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platform,
  ...policy,
  ...customers,
  ...scheduling,
}

export default models
