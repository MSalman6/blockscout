import { Bytes } from "@graphprotocol/graph-ts";

import {
  Renew as RenewEvent,
  Transfer as TransferEvent,
} from "./types/DMDNames/DMDNames";

import { Domain, NameTransferred, Registration } from "./types/schema";

import {
  createEventID,
  createOrLoadAccount,
  createOrLoadDomain,
  dmdNodeFromLabelhash,
  DMD_NODE,
  EMPTY_ADDRESS,
  uint256ToByteArray,
} from "./utils";

/**
 * ERC-721 Transfer on DMDNames — the authoritative owner of a `.dmd` name.
 *
 * tokenId == uint256(labelhash), so the namehash is computable here without
 * knowing the plaintext label: node = keccak256(DMD_NODE ++ labelhash).
 *
 * Ordering matters. Inside DMDRegistrarController.register() this event fires
 * *before* the registry's NewOwner, so creating the Domain here means the
 * registry handler finds an existing record and leaves `owner` intact.
 */
export function handleNameTransferred(event: TransferEvent): void {
  let labelhash = uint256ToByteArray(event.params.tokenId);
  let node = dmdNodeFromLabelhash(labelhash);
  let to = event.params.to.toHexString();

  createOrLoadAccount(to);

  let domain = createOrLoadDomain(node, event.block.timestamp);
  domain.parent = DMD_NODE;
  domain.labelhash = Bytes.fromByteArray(labelhash);
  domain.tokenId = event.params.tokenId;

  if (to == EMPTY_ADDRESS) {
    // Burn (expired name being re-registered). Drop ownership and expiry so the
    // name stops resolving until the new registration writes them again.
    domain.owner = EMPTY_ADDRESS;
    domain.registrant = null;
    domain.expiryDate = null;
  } else {
    domain.owner = to;
    domain.registrant = to;
  }
  domain.save();

  let registration = Registration.load(labelhash.toHexString());
  if (registration !== null) {
    registration.registrant = to;
    registration.save();
  }

  // Only genuine transfers become history entries. A mint has no Registration
  // yet (handleNameRegistered creates it later in the same transaction) and a
  // burn is an implementation detail of re-registering an expired name.
  if (event.params.from.toHexString() == EMPTY_ADDRESS || to == EMPTY_ADDRESS) {
    return;
  }

  let e = new NameTransferred(createEventID(event));
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.registration = labelhash.toHexString();
  e.newOwner = to;
  e.save();
}

/** Renew(tokenId, expiration) — DMD's equivalent of the ENS BaseRegistrar renewal. */
export function handleRenew(event: RenewEvent): void {
  let labelhash = uint256ToByteArray(event.params.id);
  let node = dmdNodeFromLabelhash(labelhash);

  let domain = Domain.load(node);
  if (domain !== null) {
    domain.expiryDate = event.params.expiration;
    domain.save();
  }

  let registration = Registration.load(labelhash.toHexString());
  if (registration !== null) {
    registration.expiryDate = event.params.expiration;
    registration.save();
  }
}
