/**
 * Matching exposures to volumes.
 *
 * A subvolume is identified by (cluster, group, name), and the same NAME occurs
 * in different groups: a person's volume lives in `fabric_users` and a
 * project's in the project's uuid. Matching on the name alone would show one
 * volume's Globus status against another's row - wrong in a way that looks
 * right, which is the failure this page exists to avoid.
 */
import type { VolumeExposure } from "@/services/globus-service";

export function exposuresForVolume(
  all: VolumeExposure[],
  cluster: string,
  group: string,
  name: string
): VolumeExposure[] {
  return all.filter(
    (e) => e.cluster === cluster && e.group_name === group && e.subvol_name === name
  );
}

/** The exposure a Withdraw button should act on, if any. */
export function liveExposure(exposures: VolumeExposure[]): VolumeExposure | undefined {
  // `removing` is already on its way out; offering Withdraw again would send a
  // second request for something the agent has not finished tearing down.
  return exposures.find((e) => e.state !== "removing");
}

/**
 * The cephx identity the DTN mounts with.
 *
 * The same name on every cluster today (see globus_env.py). When sites start
 * using different ones it belongs in the endpoint record rather than here - a
 * constant that is right by coincidence is worth flagging as one.
 */
export const DTN_CLIENT = "globus-dtn";

/**
 * True when a failure is the DTN's key lacking a path for this volume.
 *
 * Matched on the manager's own wording. The agent cannot widen its own key -
 * one that could would make the mount boundary meaningless - so this is the
 * single failure an operator resolves by granting, and it is worth offering
 * that directly. Offering it for any other failure would be worse than
 * offering none: it sends the operator down a path that cannot work and hides
 * the real cause.
 */
export function needsDtnGrant(e: VolumeExposure): boolean {
  return e.state === "failed" && /is not mounted/.test(e.detail ?? "");
}
