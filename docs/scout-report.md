

<style>
.markdown-body table {min-width: 100%;width: 100%;display: table;}
thead {min-width: 100%;width: 100%;}
th {min-width: 60%;width: 60%;}
th:last-child {min-width: 20%;width: 20%;}
th:first-child {min-width: 20%;width: 20%;}
</style>



# Scout Report - CrimsonSentry - 2026-10-17

## Summary

| <span style="color:green">Crate</span> | <span style="color:green">Status</span> | <span style="color:green">Critical</span> | <span style="color:green">Medium</span> | <span style="color:green">Minor</span> | <span style="color:green">Enhancement</span> | 
| - | - | - | - | - | - | 
| policy_vault | Analyzed | 0 | 2 | 0 | 9 | 


Issues found:



- [Dynamic Storage](#dynamic-storage) (1 results) (Medium)

- [Soroban Version](#soroban-version) (9 results) (Enhancement)

- [Missing New Admin Auth](#missing-new-admin-auth) (1 results) (Medium)



## Resource Management



### Dynamic Storage

**Impact:** Medium

**Issue:** Using dynamic types in instance or persistent storage can lead to unnecessary growth or storage-related vulnerabilities.

**Description:** Using dynamic types in instance or persistent storage can lead to unnecessary growth or storage-related vulnerabilities.

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/dynamic-storage)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 1 | contracts | [lib.rs:279:9 - 279:65](../contracts/policy-vault/src/lib.rs) |



## Best Practices



### Soroban Version

**Impact:** Enhancement

**Issue:** Use the latest version of Soroban

**Description:** Using a older version of Soroban can be dangerous, as it may have bugs or security issues. Use the latest version available.

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/soroban-version)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 0 | contracts | [lib.rs:1:1 - 1:1](../contracts/policy-vault/src/lib.rs) |


### Storage Change Events

**Impact:** Enhancement

**Issue:** Consider emiting an event when storage is modified

**Description:** Emiting an event when storage changes is a good practice to make the contracts more transparent and usable to its clients and observers

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/storage-change-events)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 3 | contracts | [lib.rs:303:5 - 303:48](../contracts/policy-vault/src/lib.rs) |
| 4 | contracts | [lib.rs:328:5 - 328:29](../contracts/policy-vault/src/lib.rs) |
| 5 | contracts | [lib.rs:386:5 - 386:34](../contracts/policy-vault/src/lib.rs) |
| 6 | contracts | [lib.rs:334:5 - 334:51](../contracts/policy-vault/src/lib.rs) |
| 7 | contracts | [lib.rs:233:5 - 233:56](../contracts/policy-vault/src/lib.rs) |
| 8 | contracts | [lib.rs:359:5 - 359:55](../contracts/policy-vault/src/lib.rs) |
| 9 | contracts | [lib.rs:324:5 - 324:27](../contracts/policy-vault/src/lib.rs) |
| 10 | contracts | [lib.rs:416:5 - 416:41](../contracts/policy-vault/src/lib.rs) |



## Authorization



### Missing New Admin Auth

**Impact:** Medium

**Issue:** New admin/owner address must sign before being stored

**Description:** When updating admin or owner, the incoming address should also sign to prevent accidental bricking due to a mistaken address.

[**Learn More**](https://coinfabrik.github.io/scout-audit/docs/detectors/soroban/missing-new-admin-auth)

#### Findings

| ID  | Package | File Location |
| --- | ------- | ------------- |
| 2 | contracts | [lib.rs:374:9 - 376:53](../contracts/policy-vault/src/lib.rs) |


