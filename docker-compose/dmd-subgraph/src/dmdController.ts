import {
  NameActivated as NameActivatedEvent,
  NameDeactivated as NameDeactivatedEvent,
  NameRegistered as NameRegisteredEvent,
  NameRenewed as NameRenewedEvent,
} from "./types/DMDRegistrarController/DMDRegistrarController";

import {
  Domain,
  NameRegistered,
  NameRenewed,
  Registration,
} from "./types/schema";

import {
  checkValidLabel,
  createEventID,
  createOrLoadAccount,
  createOrLoadDomain,
  dmdNodeFromLabelhash,
  DMD_NODE,
} from "./utils";

/**
 * The controller is the only contract that emits plaintext labels, so these
 * handlers are what make `label_name` and `name` known. BENS discards any domain
 * whose `label_name` is NULL and any name matching '%[%', so without this the
 * subgraph would index correctly and still return nothing.
 *
 * No ENS rainbow table is needed as a result.
 */

/**
 * NameRegistered(address node, bytes32 labelHash, uint256 expiration, string name)
 *
 * Note the first parameter is named `node` in the ABI but is the registrant's
 * address — it is emitted as `msg.sender`.
 *
 * Fires last in register(), after the ERC-721 mint and after any activation, so
 * the Domain already exists and carries the correct owner.
 */
export function handleNameRegistered(event: NameRegisteredEvent): void {
  let label = event.params.name;
  if (!checkValidLabel(label)) return;

  let labelhash = event.params.labelHash;
  let node = dmdNodeFromLabelhash(labelhash);
  let registrant = event.params.node.toHexString();

  createOrLoadAccount(registrant);

  let domain = createOrLoadDomain(node, event.block.timestamp);
  domain.labelName = label;
  domain.name = label + ".dmd";
  domain.parent = DMD_NODE;
  domain.labelhash = labelhash;
  domain.expiryDate = event.params.expiration;
  domain.registrant = registrant;
  domain.save();

  let registrationId = labelhash.toHexString();
  let registration = Registration.load(registrationId);
  if (registration === null) {
    registration = new Registration(registrationId);
    registration.domain = node;
  }
  registration.registrationDate = event.block.timestamp;
  registration.expiryDate = event.params.expiration;
  registration.registrant = registrant;
  registration.labelName = label;
  registration.save();

  let e = new NameRegistered(createEventID(event));
  e.registration = registrationId;
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.registrant = registrant;
  e.expiryDate = event.params.expiration;
  e.save();
}

/** NameRenewed(address owner, bytes32 labelHash, uint256 expiration, string name) */
export function handleNameRenewed(event: NameRenewedEvent): void {
  let labelhash = event.params.labelHash;
  let node = dmdNodeFromLabelhash(labelhash);

  let domain = Domain.load(node);
  if (domain !== null) {
    domain.expiryDate = event.params.expiration;
    if (checkValidLabel(event.params.name)) {
      domain.labelName = event.params.name;
      domain.name = event.params.name + ".dmd";
    }
    domain.save();
  }

  let registrationId = labelhash.toHexString();
  let registration = Registration.load(registrationId);
  if (registration !== null) {
    registration.expiryDate = event.params.expiration;
    registration.save();
  }

  let e = new NameRenewed(createEventID(event));
  e.registration = registrationId;
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.expiryDate = event.params.expiration;
  e.save();
}

/**
 * NameActivated — the name became this address's primary name. The registry and
 * resolver writes that back it (NewOwner / NewResolver / AddrChanged /
 * NameChanged) all fire earlier in the same transaction, so all this needs to do
 * is backfill the plaintext label that those events could not carry.
 */
export function handleNameActivated(event: NameActivatedEvent): void {
  let label = event.params.name;
  if (!checkValidLabel(label)) return;

  let node = dmdNodeFromLabelhash(event.params.labelHash);
  let domain = Domain.load(node);
  if (domain === null) return;

  domain.labelName = label;
  domain.name = label + ".dmd";
  domain.parent = DMD_NODE;
  domain.save();
}

/**
 * NameDeactivated — the name is no longer primary. The contract has already
 * emitted AddrChanged(0x0) and NewResolver(0x0) for both the forward and the
 * reverse node, which is what actually stops it resolving. The Domain is kept:
 * the NFT is still owned and the name is still registered.
 */
export function handleNameDeactivated(event: NameDeactivatedEvent): void {
  let node = dmdNodeFromLabelhash(event.params.labelHash);
  let domain = Domain.load(node);
  if (domain === null) return;

  domain.resolvedAddress = null;
  domain.save();
}
