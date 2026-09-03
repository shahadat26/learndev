```groovy
pipeline {
    agent any

    environment {
        APP_DIR = '/opt/apps/learndev'
    }

    stages {

        stage('Update Source') {
            steps {
                sh '''
                    set -e

                    echo "=== Updating deployment source ==="

                    cd "$APP_DIR"

                    git fetch origin master
                    git reset --hard origin/master
                    git clean -fd

                    echo "=== Deployment Commit ==="
                    git log -1 --oneline
                '''
            }
        }

        stage('Verify') {
            steps {
                sh '''
                    set -e

                    cd "$APP_DIR"

                    echo "=== Git ==="
                    git branch --show-current
                    git status --short
                    git log -1 --oneline

                    echo "=== Docker ==="
                    docker version --format '{{.Server.Version}}'

                    echo "=== Compose ==="
                    docker compose version
                '''
            }
        }

        stage('Build') {
            steps {
                sh '''
                    set -e

                    cd "$APP_DIR"

                    echo "=== Building Docker images ==="

                    docker compose build \
                        frontend \
                        account-service \
                        product-service
                '''
            }
        }

        stage('Deploy') {
            steps {
                sh '''
                    set -e

                    cd "$APP_DIR"

                    echo "=== Deploying ==="

                    docker compose up -d \
                        frontend \
                        account-service \
                        product-service
                '''
            }
        }

        stage('Health Check') {
            steps {
                sh '''
                    set -e

                    cd "$APP_DIR"

                    echo "=== Health Check ==="

                    sleep 15

                    docker compose ps
                '''
            }
        }
    }

    post {
        success {
            echo 'Deployment completed successfully.'
        }

        failure {
            echo 'Deployment failed.'
        }
    }
}
```

