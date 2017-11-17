Vagrant.configure("2") do |config|
  config.vm.box = "phusion/ubuntu-14.04-amd64"

  config.vm.synced_folder ENV['HOME'], ENV['HOME']

  # We need to configure docker to expose port 60366
  config.vm.provision "shell", inline: <<-SCRIPT

  # Setup Taskcluster and Pulse Credentials if available
  echo 'export TASKCLUSTER_CLIENT_ID="#{ENV['TASKCLUSTER_CLIENT_ID']}"' >> /home/vagrant/.bash_profile
  echo 'export TASKCLUSTER_ACCESS_TOKEN="#{ENV['TASKCLUSTER_ACCESS_TOKEN']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_USERNAME="#{ENV['PULSE_USERNAME']}"' >> /home/vagrant/.bash_profile
  echo 'export PULSE_PASSWORD="#{ENV['PULSE_PASSWORD']}"' >> /home/vagrant/.bash_profile
  echo 'export AWS_ACCESS_KEY_ID="#{ENV['AWS_ACCESS_KEY_ID']}"' >> /home/vagrant/.bash_profile
  echo 'export AWS_SECRET_ACCESS_KEY="#{ENV['AWS_SECRET_ACCESS_KEY']}"' >> /home/vagrant/.bash_profile

SCRIPT

  config.vm.provision "shell", path: 'vagrant.sh'
  # Requires vagrant-reload plugin
  config.vm.provision :reload
end
