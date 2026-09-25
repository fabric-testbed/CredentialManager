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
