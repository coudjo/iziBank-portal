/** Production builds carry no mock API. A config that asks for one is a deployment mistake, so starting fails. */
export async function startMocks(): Promise<void> {
  throw new Error('This build has no mock API. Set "useMocks" to false in config.json.');
}
