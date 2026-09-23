import {
  AddrChanged as AddrChangedEvent,
  NameChanged as NameChangedEvent,
} from "./types/DMDResolver/DMDResolver";

import { AddrChanged, Domain, NameChanged, Resolver } from "./types/schema";

import {
  containsNullByte,
  createEventID,
  createOrLoadAccount,
  createResolverID,
} from "./utils";

/** Forward resolution: <label>.dmd -> address. Identical to ENS. */
export function handleAddrChanged(event: AddrChangedEvent): void {
  let node = event.params.node.toHexString();
  createOrLoadAccount(event.params.a.toHexString());

  let id = createResolverID(node, event.address.toHexString());
  let resolver = Resolver.load(id);
  if (resolver == null) {
    resolver = new Resolver(id);
    resolver.domain = node;
    resolver.address = event.address;
  }
  resolver.addr = event.params.a.toHexString();
  resolver.save();

  let domain = Domain.load(node);
  if (domain !== null && domain.resolver == id) {
    domain.resolvedAddress = event.params.a.toHexString();
    domain.save();
  }

  let e = new AddrChanged(createEventID(event));
  e.resolver = id;
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.addr = event.params.a.toHexString();
  e.save();
}

/**
 * Reverse resolution: <hexaddr>.addr.reverse -> "<label>.dmd".
 *
 * This row is what BENS's addr_reverse_names materialised view reads. The view
 * joins name_changed.name against domain.name, so the string written here must
 * be the full name including the ".dmd" suffix — which is what the controller
 * emits. Deactivation emits an empty name; skip it so the stale row is not
 * resurrected (the accompanying NewResolver(0x0) already breaks the join).
 */
export function handleNameChanged(event: NameChangedEvent): void {
  if (containsNullByte(event.params.name)) return;
  if (event.params.name.length == 0) return;

  let e = new NameChanged(createEventID(event));
  e.resolver = createResolverID(
    event.params.node.toHexString(),
    event.address.toHexString()
  );
  e.blockNumber = event.block.number.toI32();
  e.transactionID = event.transaction.hash;
  e.name = event.params.name;
  e.save();
}
