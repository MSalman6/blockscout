import { crypto } from "@graphprotocol/graph-ts";

import {
  NewOwner as NewOwnerEvent,
  NewResolver as NewResolverEvent,
  NewTTL as NewTTLEvent,
  Transfer as TransferEvent,
} from "./types/DMDRegistry/DMDRegistry";

import {
  Domain,
  NewOwner,
  NewResolver,
  NewTTL,
  Resolver,
  Transfer,
} from "./types/schema";

import {
  concat,
  createEventID,
  createOrLoadAccount,
  createOrLoadDomain,
  createResolverID,
  DMD_NODE,
  EMPTY_ADDRESS,
  EMPTY_ADDRESS_BYTEARRAY,
} from "./utils";

function makeSubnode(event: NewOwnerEvent): string {
  return crypto
    .keccak256(concat(event.params.node, event.params.label))
    .toHexString();
}

/**
 * NewOwner.
 *
 * Divergence from ENS: for children of `.dmd` the registry owner is always the
 * DMDRegistrarController, never the person who registered the name — the
 * controller calls setSubnodeRecord(DMD_NODE, labelhash, address(this), ...).
 * The real owner is whoever holds the DMDNames ERC-721, so we must not let this
 * handler clobber the owner written by dmdNames.ts. Reverse records
 * (<hexaddr>.addr.reverse) keep ENS semantics and are owned by the controller.
 */
export function handleNewOwner(event: NewOwnerEvent): void {
  createOrLoadAccount(event.params.owner.toHexString());

  let subnode = makeSubnode(event);
  let parentId = event.params.node.toHexString();

  let domain = createOrLoadDomain(subnode, event.block.timestamp);
  let parent = Domain.load(parentId);

  if (domain.parent === null && parent !== null) {
    parent.subdomainCount = parent.subdomainCount + 1;
    parent.save();
  }

  // Name backfill: for .dmd children the plaintext label arrives later in the
  // same transaction via the controller, so leave `name` alone here rather than
  // writing a "[0x…]" placeholder that BENS would filter out.
  if (domain.name === null && parentId != DMD_NODE) {
    let label = "[" + event.params.label.toHexString().slice(2) + "]";
    if (parentId == "0x0000000000000000000000000000000000000000000000000000000000000000") {
      domain.name = label;
    } else if (parent !== null && parent.name !== null) {
      domain.name = label + "." + parent.name!;
    }
  }

  if (parentId != DMD_NODE) {
    domain.owner = event.params.owner.toHexString();
  } else if (domain.owner == EMPTY_ADDRESS) {
    // Placeholder only; dmdNames.ts sets the real owner from the ERC-721.
    domain.owner = event.params.owner.toHexString();
  }

  domain.parent = parentId;
  domain.labelhash = event.params.label;
  domain.save();

  let e = new NewOwner(createEventID(event));
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.parentDomain = parentId;
  e.domain = subnode;
  e.owner = event.params.owner.toHexString();
  e.save();
}

/**
 * NewResolver. Identical to ENS.
 *
 * The Resolver entity id is `<resolverAddress>-<node>`; BENS's addr_reverse view
 * joins name_changed.resolver against domain.resolver on exactly this id, so the
 * format must not change. Deactivation sets the resolver to 0x0, which nulls it
 * here and correctly drops the reverse record from that view.
 */
export function handleNewResolver(event: NewResolverEvent): void {
  let node = event.params.node.toHexString();
  let domain = createOrLoadDomain(node, event.block.timestamp);

  let id: string | null = null;
  if (!event.params.resolver.equals(EMPTY_ADDRESS_BYTEARRAY)) {
    id = createResolverID(node, event.params.resolver.toHexString());
  }
  domain.resolver = id;

  if (id !== null) {
    let resolver = Resolver.load(id);
    if (resolver == null) {
      resolver = new Resolver(id);
      resolver.domain = node;
      resolver.address = event.params.resolver;
      resolver.save();
      domain.resolvedAddress = null;
    } else {
      domain.resolvedAddress = resolver.addr;
    }
  } else {
    domain.resolvedAddress = null;
  }
  domain.save();

  let e = new NewResolver(createEventID(event));
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.domain = node;
  e.resolver = id ? id : EMPTY_ADDRESS;
  e.save();
}

export function handleNewTTL(event: NewTTLEvent): void {
  let node = event.params.node.toHexString();
  let domain = Domain.load(node);
  if (domain === null) return;

  domain.ttl = event.params.ttl;
  domain.save();

  let e = new NewTTL(createEventID(event));
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.domain = node;
  e.ttl = event.params.ttl;
  e.save();
}

/** Registry-level Transfer(node, owner). Not the ERC-721 transfer — see dmdNames.ts. */
export function handleTransfer(event: TransferEvent): void {
  let node = event.params.node.toHexString();
  createOrLoadAccount(event.params.owner.toHexString());

  let domain = createOrLoadDomain(node, event.block.timestamp);
  if (domain.parent != DMD_NODE) {
    domain.owner = event.params.owner.toHexString();
    domain.save();
  }

  let e = new Transfer(createEventID(event));
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.domain = node;
  e.owner = event.params.owner.toHexString();
  e.save();
}
