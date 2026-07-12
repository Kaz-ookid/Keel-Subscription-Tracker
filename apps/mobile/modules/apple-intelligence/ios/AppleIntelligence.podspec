Pod::Spec.new do |s|
  s.name           = 'AppleIntelligence'
  s.version        = '1.0.0'
  s.summary        = 'On-device Foundation Models bridge for Keel'
  s.description    = 'Runs the Apple Intelligence on-device model to turn rough text into Keel import JSON.'
  s.author         = 'Keel'
  s.homepage       = 'https://github.com/Kaz-ookid/Keel'
  s.license        = { :type => 'MIT' }
  s.platforms      = { :ios => '15.1' }
  s.source         = { :git => '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
  s.source_files = '**/*.{h,m,swift}'
end
