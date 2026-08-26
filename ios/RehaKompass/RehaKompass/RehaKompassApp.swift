import SwiftUI

@main
struct RehaKompassApp: App {
    @StateObject private var vault = VaultStore()
    @StateObject private var gate = BiometricGate()

    var body: some Scene {
        WindowGroup {
            AppRootView()
                .environmentObject(vault)
                .environmentObject(gate)
                .preferredColorScheme(.dark)
        }
    }
}
