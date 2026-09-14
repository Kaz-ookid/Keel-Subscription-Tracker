Pod::Spec.new do |s|
  s.name           = 'KeelTrialAnchor'
  s.version        = '1.0.0'
  s.summary        = 'iCloud key-value store bridge for the Keel trial anchor'
  s.description    = 'Reads and writes the trial-start date in NSUbiquitousKeyValueStore so the trial clock follows the Apple ID across devices and reinstalls.'
  s.author         = 'Keel'
  s.homepage       = 'https://keel-app.ch'
  s.license        = { :type => 'Proprietary' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
