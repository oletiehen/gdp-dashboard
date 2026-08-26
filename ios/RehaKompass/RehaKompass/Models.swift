import Foundation

enum QuickEntryType: String, CaseIterable, Identifiable, Codable {
    case appointment = "Termin"
    case task = "Aufgabe"
    case journal = "Tagebuch"
    case session = "Sitzung"
    case therapyPlan = "Therapieplan"
    case document = "Dokument"
    var id: String { rawValue }
}

struct CompassTask: Identifiable, Codable, Hashable {
    var id = UUID()
    var title: String
    var note: String = ""
    var dueDate: Date?
    var completed = false
}

struct JournalEntry: Identifiable, Codable, Hashable {
    var id = UUID()
    var createdAt = Date()
    var text: String
}

struct RehabProfile: Codable, Hashable {
    var displayName = "Olaf"
    var currentPhase = "Vorbereitung"
    var personalGoal = ""
}

struct VaultState: Codable {
    var tasks: [CompassTask] = []
    var journal: [JournalEntry] = []
    var profile = RehabProfile()
}
