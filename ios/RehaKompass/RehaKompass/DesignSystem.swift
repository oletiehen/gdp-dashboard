import SwiftUI

enum AppTheme {
    static let background = Color(red: 7/255, green: 12/255, blue: 18/255)
    static let panel = Color(red: 13/255, green: 22/255, blue: 31/255)
    static let gold = Color(red: 220/255, green: 177/255, blue: 70/255)
    static let ivory = Color(red: 242/255, green: 239/255, blue: 226/255)
}

struct PremiumCard<Content: View>: View {
    @ViewBuilder var content: Content

    var body: some View {
        content
            .padding(18)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(AppTheme.panel)
            .overlay(RoundedRectangle(cornerRadius: 22).stroke(AppTheme.gold.opacity(0.55), lineWidth: 1))
            .clipShape(RoundedRectangle(cornerRadius: 22))
    }
}
