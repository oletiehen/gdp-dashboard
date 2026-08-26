import SwiftUI

struct TodayView: View {
    @EnvironmentObject private var vault: VaultStore

    private let areas: [(String, String)] = [
        ("Entzug & Reha", "heart.text.square"),
        ("Kalender", "calendar"),
        ("Freizeit", "figure.walk"),
        ("Aufgaben", "checklist"),
        ("Therapieplan", "doc.text"),
        ("Tagebuch", "book.closed"),
        ("MeTime", "sparkles"),
        ("Klinikdossier", "cross.case")
    ]

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 5) {
                    Text("OLAF TIEHEN")
                        .font(.caption.weight(.semibold))
                        .tracking(2.2)
                        .foregroundStyle(AppTheme.gold)
                    Text("Persönlicher Reha-Kompass")
                        .font(.title2.bold())
                }

                LazyVGrid(columns: [.init(.flexible()), .init(.flexible())], spacing: 12) {
                    ForEach(areas, id: \.0) { area in
                        PremiumCard {
                            Image(systemName: area.1)
                                .foregroundStyle(AppTheme.gold)
                                .font(.title2)
                            Text(area.0)
                                .font(.headline)
                                .padding(.top, 8)
                        }
                    }
                }

                PremiumCard {
                    Text("Nächster sinnvoller Schritt")
                        .font(.caption.bold())
                        .foregroundStyle(AppTheme.gold)
                    if let task = vault.state.tasks.first(where: { !$0.completed }) {
                        Text(task.title).font(.title3.bold()).padding(.vertical, 4)
                        Button("Erledigt") { vault.toggleTask(task) }
                            .buttonStyle(.bordered)
                            .tint(AppTheme.gold)
                    } else {
                        Text("Für heute ist noch keine Aufgabe vorgemerkt.")
                            .foregroundStyle(.secondary)
                    }
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Heute")
        .toolbarBackground(AppTheme.background, for: .navigationBar)
    }
}
