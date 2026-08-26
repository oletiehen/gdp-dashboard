import SwiftUI

struct QuickAddView: View {
    @Environment(\.dismiss) private var dismiss
    @EnvironmentObject private var vault: VaultStore
    @State private var selectedType: QuickEntryType = .task
    @State private var text = ""

    var body: some View {
        NavigationStack {
            Form {
                Picker("Typ", selection: $selectedType) {
                    ForEach(QuickEntryType.allCases) { type in Text(type.rawValue).tag(type) }
                }
                TextField(selectedType == .task ? "Was ist zu erledigen?" : "Eintrag", text: $text, axis: .vertical)
                    .lineLimit(3...8)
            }
            .navigationTitle("Schnell eintragen")
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Abbrechen") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) {
                    Button("Speichern") {
                        switch selectedType {
                        case .task: vault.addTask(title: text)
                        case .journal, .session: vault.addJournal(text: text)
                        default: vault.addTask(title: "\(selectedType.rawValue): \(text)")
                        }
                        dismiss()
                    }
                    .disabled(text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                }
            }
        }
    }
}
