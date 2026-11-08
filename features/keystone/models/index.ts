import { User } from './User'
import { Role } from './Role'
import { OAuthApp } from './OAuthApp'
import { OAuthToken } from './OAuthToken'
import * as platform from './platform'
import * as policy from './policy'
import * as customers from './customers'
import * as scheduling from './scheduling'
import * as repairOrders from './repairOrders'
import * as inspections from './inspections'
import * as estimates from './estimates'
import * as billing from './billing'
import * as parts from './parts'

export const models = {
  User,
  Role,
  OAuthApp,
  OAuthToken,
  ...platform,
  ...policy,
  ...customers,
  ...scheduling,
  ...repairOrders,
  ...inspections,
  ...estimates,
  ...billing,
  ...parts,
}

export default models
