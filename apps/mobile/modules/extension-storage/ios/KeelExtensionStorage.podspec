Pod::Spec.new do |s|
  s.name           = 'KeelExtensionStorage'
  s.version        = '1.0.0'
  s.summary        = 'App Group storage bridge for the Keel widgets'
  s.description    = 'Writes the pre-formatted widget snapshot into the shared App Group and reloads WidgetKit timelines.'
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
