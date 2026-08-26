import SwiftUI

struct MoreView: View {
    @EnvironmentObject private var gate: BiometricGate

    private let sections = [
        "Listen & Aufgaben", "Tagebuch & Festhalten", "Dokumente", "Coach", "MeTime",
        "Freizeit & Umgebung", "Reha-Klinikdossier", "Kontakte", "Profil & Ziele",
        "Erinnerungen", "Sicherung & Neustart", "Bedienung & Systemstatus"
    ]

    var body: some View {
        List {
            Section("Persönlicher Reha-Kompass") {
                ForEach(sections, id: \.self) { title in
                    NavigationLink(title) { PlaceholderFeatureView(title: title) }
                }
            }
            Section {
                Button("Sicher sperren", role: .destructive) { gate.lock() }
            }
        }
        .scrollContentBackground(.hidden)
        .background(AppTheme.background)
        .navigationTitle("Mehr")
    }
}

private struct PlaceholderFeatureView: View {
    let title: String
    var body: some View {
        ScrollView {
            PremiumCard {
                Text(title).font(.title2.bold())
                Text("Dieser Bereich ist in der nativen App-Struktur bereits angelegt und wird jetzt Funktion für Funktion aus dem bisherigen Reha-Kompass übernommen.")
                    .foregroundStyle(.secondary)
                    .padding(.top, 8)
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle(title)
    }
}
