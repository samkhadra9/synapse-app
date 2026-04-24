Pod::Spec.new do |s|
  s.name           = 'AiteallNative'
  s.version        = '1.0.0'
  s.summary        = 'Aiteall native helpers — AppIntents, Live Activity, App Group bridge.'
  s.description    = 'Local Expo module exposing Swift extensions for the main Aiteall iOS app.'
  s.author         = 'Aiteall'
  s.homepage       = 'https://aiteall.app'
  s.platforms      = { :ios => '16.4' }
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'

  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
    'SWIFT_COMPILATION_MODE' => 'wholemodule'
  }

  s.source_files = "**/*.{h,m,swift}"
end
