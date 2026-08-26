import Foundation
import CryptoKit
import Security

@MainActor
final class VaultStore: ObservableObject {
    @Published private(set) var state = VaultState()

    private let fileName = "rehakompass-vault.bin"
    private let keyAccount = "rehakompass.vault.key.v1"

    init() { load() }

    func addTask(title: String) {
        state.tasks.insert(CompassTask(title: title), at: 0)
        save()
    }

    func addJournal(text: String) {
        state.journal.insert(JournalEntry(text: text), at: 0)
        save()
    }

    func toggleTask(_ task: CompassTask) {
        guard let index = state.tasks.firstIndex(where: { $0.id == task.id }) else { return }
        state.tasks[index].completed.toggle()
        save()
    }

    func exportReadableBackup() throws -> Data {
        try JSONEncoder.pretty.encode(state)
    }

    func importReadableBackup(_ data: Data) throws {
        state = try JSONDecoder().decode(VaultState.self, from: data)
        save()
    }

    private func save() {
        do {
            let plaintext = try JSONEncoder().encode(state)
            let sealed = try AES.GCM.seal(plaintext, using: symmetricKey())
            guard let combined = sealed.combined else { return }
            try combined.write(to: vaultURL, options: [.atomic, .completeFileProtection])
        } catch {
            assertionFailure("Vault save failed: \(error)")
        }
    }

    private func load() {
        guard let data = try? Data(contentsOf: vaultURL) else { return }
        do {
            let box = try AES.GCM.SealedBox(combined: data)
            let plaintext = try AES.GCM.open(box, using: symmetricKey())
            state = try JSONDecoder().decode(VaultState.self, from: plaintext)
        } catch {
            assertionFailure("Vault load failed: \(error)")
        }
    }

    private var vaultURL: URL {
        let base = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
        try? FileManager.default.createDirectory(at: base, withIntermediateDirectories: true)
        return base.appendingPathComponent(fileName)
    }

    private func symmetricKey() throws -> SymmetricKey {
        if let existing = try Keychain.read(account: keyAccount) {
            return SymmetricKey(data: existing)
        }
        let key = SymmetricKey(size: .bits256)
        let data = key.withUnsafeBytes { Data($0) }
        try Keychain.write(data, account: keyAccount)
        return key
    }
}

private enum Keychain {
    static let service = "de.olaftiehen.RehaKompass"

    static func write(_ data: Data, account: String) throws {
        let base: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account
        ]
        SecItemDelete(base as CFDictionary)
        var query = base
        query[kSecValueData as String] = data
        query[kSecAttrAccessible as String] = kSecAttrAccessibleWhenUnlockedThisDeviceOnly
        let status = SecItemAdd(query as CFDictionary, nil)
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
    }

    static func read(account: String) throws -> Data? {
        let query: [String: Any] = [
            kSecClass as String: kSecClassGenericPassword,
            kSecAttrService as String: service,
            kSecAttrAccount as String: account,
            kSecReturnData as String: true,
            kSecMatchLimit as String: kSecMatchLimitOne
        ]
        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)
        if status == errSecItemNotFound { return nil }
        guard status == errSecSuccess else { throw NSError(domain: NSOSStatusErrorDomain, code: Int(status)) }
        return item as? Data
    }
}

private extension JSONEncoder {
    static var pretty: JSONEncoder {
        let encoder = JSONEncoder()
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }
}
