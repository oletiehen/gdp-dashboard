import SwiftUI

struct AppRootView: View {
    @EnvironmentObject private var gate: BiometricGate
    @State private var selectedTab: AppTab = .today
    @State private var showQuickAdd = false

    var body: some View {
        Group {
            if gate.isUnlocked {
                ZStack(alignment: .bottom) {
                    TabView(selection: $selectedTab) {
                        NavigationStack { TodayView() }
                            .tabItem { Label("Heute", systemImage: "safari") }
                            .tag(AppTab.today)

                        NavigationStack { RehabView() }
                            .tabItem { Label("Entzug/Reha", systemImage: "heart.text.square") }
                            .tag(AppTab.rehab)

                        NavigationStack { CalendarHomeView() }
                            .tabItem { Label("Kalender", systemImage: "calendar") }
                            .tag(AppTab.calendar)

                        NavigationStack { MoreView() }
                            .tabItem { Label("Mehr", systemImage: "ellipsis.circle") }
                            .tag(AppTab.more)
                    }
                    .tint(AppTheme.gold)

                    Button {
                        showQuickAdd = true
                    } label: {
                        Image(systemName: "plus")
                            .font(.title2.bold())
                            .foregroundStyle(.black)
                            .frame(width: 58, height: 58)
                            .background(AppTheme.gold)
                            .clipShape(Circle())
                            .shadow(radius: 12)
                    }
                    .offset(y: -8)
                    .accessibilityLabel("Schnell eintragen")
                }
                .sheet(isPresented: $showQuickAdd) { QuickAddView() }
            } else {
                LockView()
            }
        }
        .task { await gate.unlock() }
    }
}

enum AppTab: Hashable { case today, rehab, calendar, more }

private struct LockView: View {
    @EnvironmentObject private var gate: BiometricGate

    var body: some View {
        ZStack {
            AppTheme.background.ignoresSafeArea()
            VStack(spacing: 24) {
                Image(systemName: "lock.shield.fill")
                    .font(.system(size: 56))
                    .foregroundStyle(AppTheme.gold)
                Text("Reha-Kompass")
                    .font(.largeTitle.bold())
                Text("Deine Daten bleiben auf diesem Gerät geschützt.")
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                Button("Mit Face ID öffnen") {
                    Task { await gate.unlock() }
                }
                .buttonStyle(.borderedProminent)
                .tint(AppTheme.gold)
                .foregroundStyle(.black)
            }
            .padding(32)
        }
    }
}
