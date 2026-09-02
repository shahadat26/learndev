pipeline {
    agent any

    environment {
        APP_DIR = '/opt/apps/learndev'
    }

    stages {

        stage('Verify') {
            steps {
                sh '''
                    cd "$APP_DIR"

                    echo "=== Git ==="
                    git branch --show-current
                    git status --short

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
                    cd "$APP_DIR"

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
                    cd "$APP_DIR"

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
                    cd "$APP_DIR"

                    echo "Waiting for services..."
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
