//
//  FifteenAttributes.swift
//  AiteallNative — shared ActivityKit attributes.
//
//  IMPORTANT: this struct's name and properties must match BYTE-FOR-BYTE
//  the copy in `targets/widget/LiveActivity.swift`. ActivityKit routes
//  activities to widget views by the attribute type's NAME, so a drift
//  here = the widget stops rendering the activity.
//
//  If you change the shape, update both files.
//

import Foundation
import ActivityKit

@available(iOS 16.1, *)
public struct FifteenAttributes: ActivityAttributes {
    public struct ContentState: Codable, Hashable {
        public let endsAt: Date
        public let label: String

        public init(endsAt: Date, label: String) {
            self.endsAt = endsAt
            self.label = label
        }
    }

    public let startedAt: Date

    public init(startedAt: Date) {
        self.startedAt = startedAt
    }
}
