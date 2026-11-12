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
import * as labor from './labor'
import * as fleet from './fleet'
import * as communications from './communications'
import { boundTake, gateFilterAndOrder } from '../security/fieldGate'

export const models = boundTake(gateFilterAndOrder({
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
  ...labor,
  ...fleet,
  ...communications,
}))

export default models
