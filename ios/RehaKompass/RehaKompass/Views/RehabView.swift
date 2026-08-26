import SwiftUI

struct RehabView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PremiumCard {
                    Text("Aktuelle Phase").font(.caption.bold()).foregroundStyle(AppTheme.gold)
                    Text("Vorbereitung").font(.title2.bold())
                    Text("Aufnahme, Übergang, Wochenziele und Packliste werden hier nativ zusammengeführt.")
                        .foregroundStyle(.secondary)
                        .padding(.top, 4)
                }
                PremiumCard {
                    Label("Packliste", systemImage: "suitcase")
                    Divider().padding(.vertical, 8)
                    Text("Prioritäten, Filter und Erledigt-Status kommen im nächsten Ausbau direkt in diesen Bereich.")
                        .foregroundStyle(.secondary)
                }
                PremiumCard {
                    Label("Krisenplan", systemImage: "shield.lefthalf.filled")
                    Divider().padding(.vertical, 8)
                    Text("Offline verfügbar und bewusst getrennt vom optionalen KI-Coach.")
                        .foregroundStyle(.secondary)
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Entzug & Reha")
    }
}
