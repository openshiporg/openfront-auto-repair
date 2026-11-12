/**
 * Voice (INTEGRATIONS §8, owner override): an interface only. No telephony vendor is connected and nothing dials.
 * A person makes the call and logs it by hand (completeVoiceTask). A future adapter would implement this and still
 * could not take an authorization: "yes, go ahead" on a call becomes a callback task for staff (I-A3).
 */
export interface VoiceAdapter {
  readonly key: string
  /** Start an outbound call for a task; returns the provider's call id. Never used by the manual adapter. */
  place(task: { id: string; target: Record<string, unknown>; script: string }): Promise<{ providerCallId: string }>
  /** The transcript of a finished call; text is untrusted. */
  transcript(providerCallId: string): Promise<{ untrusted: string }>
}

export const manualVoice: VoiceAdapter = {
  key: 'manual',
  async place() { throw new Error('Calls are made by a person. Log the result when the call is done.') },
  async transcript() { return { untrusted: '' } },
}
