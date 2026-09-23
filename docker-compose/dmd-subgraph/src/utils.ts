import { BigInt, ByteArray, crypto, ethereum } from "@graphprotocol/graph-ts";
import { Account, Domain } from "./types/schema";

/** namehash("dmd") — every registered name is a direct child of this node. */
export const DMD_NODE =
  "0x9904bf4b5751e3b6a8b75d14c49424160de1a8fa8a90fd5c9fccdeac0503e612";

/** namehash("addr.reverse") — identical to ENS. BENS filters reverse records on this. */
export const ADDR_REVERSE_NODE =
  "0x91d1777781884d03a6757a803996e38de2a42967fb37eeaca72729271025a9e2";

export const ROOT_NODE =
  "0x0000000000000000000000000000000000000000000000000000000000000000";
export const EMPTY_ADDRESS = "0x0000000000000000000000000000000000000000";
export const EMPTY_ADDRESS_BYTEARRAY = new ByteArray(20);
export const BIG_INT_ZERO = BigInt.fromI32(0);

export function createEventID(event: ethereum.Event): string {
  return event.block.number
    .toString()
    .concat("-")
    .concat(event.logIndex.toString());
}

export function concat(a: ByteArray, b: ByteArray): ByteArray {
  let out = new Uint8Array(a.length + b.length);
  for (let i = 0; i < a.length; i++) out[i] = a[i];
  for (let j = 0; j < b.length; j++) out[a.length + j] = b[j];
  return changetype<ByteArray>(out);
}

export function byteArrayFromHex(s: string): ByteArray {
  if (s.length % 2 !== 0) throw new TypeError("Hex string must have an even length");
  let out = new Uint8Array(s.length / 2);
  for (let i = 0; i < s.length; i += 2) {
    out[i / 2] = parseInt(s.substring(i, i + 2), 16) as u32;
  }
  return changetype<ByteArray>(out);
}

export function uint256ToByteArray(i: BigInt): ByteArray {
  return byteArrayFromHex(i.toHex().slice(2).padStart(64, "0"));
}

/** node = keccak256(DMD_NODE ++ labelhash) — the standard ENS namehash step. */
export function dmdNodeFromLabelhash(labelhash: ByteArray): string {
  return crypto
    .keccak256(concat(byteArrayFromHex(DMD_NODE.slice(2)), labelhash))
    .toHexString();
}

export function createResolverID(node: string, resolver: string): string {
  return resolver.concat("-").concat(node);
}

export function createOrLoadAccount(address: string): Account {
  let account = Account.load(address);
  if (account == null) {
    account = new Account(address);
    account.save();
  }
  return account;
}

/**
 * Domain.owner is non-nullable in the schema, so every code path that can create
 * a Domain has to seed it. Callers overwrite `owner` with the real value.
 */
export function createOrLoadDomain(node: string, timestamp: BigInt): Domain {
  let domain = Domain.load(node);
  if (domain == null) {
    domain = new Domain(node);
    domain.owner = EMPTY_ADDRESS;
    domain.isMigrated = true;
    domain.createdAt = timestamp;
    domain.subdomainCount = 0;
    domain.storedOffchain = false;
    domain.resolvedWithWildcard = false;
  }
  return domain;
}

export function checkValidLabel(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    let c = name.charCodeAt(i);
    if (c === 0 || c === 46) return false;
  }
  return true;
}

/** Graph-node rejects strings with embedded NUL bytes; screen them out. */
export function containsNullByte(name: string): boolean {
  for (let i = 0; i < name.length; i++) {
    if (name.charCodeAt(i) === 0) return true;
  }
  return false;
}
