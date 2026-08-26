import Foundation
import LocalAuthentication

@MainActor
final class BiometricGate: ObservableObject {
    @Published private(set) var isUnlocked = false

    func unlock() async {
        let context = LAContext()
        context.localizedCancelTitle = "Abbrechen"
        do {
            var error: NSError?
            guard context.canEvaluatePolicy(.deviceOwnerAuthentication, error: &error) else { return }
            let ok = try await context.evaluatePolicy(
                .deviceOwnerAuthentication,
                localizedReason: "Öffne deinen persönlichen Reha-Kompass"
            )
            isUnlocked = ok
        } catch {
            isUnlocked = false
        }
    }

    func lock() { isUnlocked = false }
}
