import SwiftUI

struct CalendarHomeView: View {
    var body: some View {
        ScrollView {
            VStack(spacing: 16) {
                PremiumCard {
                    Label("Heute", systemImage: "calendar.day.timeline.left")
                        .font(.headline)
                    Text(Date.now.formatted(date: .complete, time: .omitted))
                        .font(.title3.bold())
                        .padding(.top, 6)
                }
                PremiumCard {
                    Text("Termine & Therapien").font(.headline)
                    Text("Die native Kalenderansicht wird mit EventKit angebunden. Übernommen wird nur, was du bestätigst.")
                        .foregroundStyle(.secondary)
                        .padding(.top, 6)
                }
            }
            .padding()
        }
        .background(AppTheme.background)
        .navigationTitle("Kalender")
    }
}
