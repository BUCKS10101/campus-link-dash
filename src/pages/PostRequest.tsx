import React, { useState } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Slider } from '@/components/ui/slider'
import Header from '@/components/layout/Header'
import MobileNav from '@/components/layout/MobileNav'
import SupportChat from '@/components/support/SupportChat'
import { useNavigate } from 'react-router-dom'
import { useToast } from '@/hooks/use-toast'
import { supabase } from '@/lib/supabase'

const PostRequest = () => {
  const navigate = useNavigate()
  const { toast } = useToast()
  const [currentStep, setCurrentStep] = useState(1)
  const [loading, setLoading] = useState(false)
  
  const [formData, setFormData] = useState({
    restaurant: '',
    orderDescription: '',
    locationType: '',
    hostelType: '',
    block: '',
    campusLocation: '',
    tip: [30]
  })

  const restaurants = [
    { id: 'one-food', name: 'One Food', icon: '🍔' },
    { id: 'dc-cafe', name: 'DC Cafe', icon: '☕' },
    { id: 'campus-store', name: 'Campus Store', icon: '🛒' }
  ]

  const hostelBlocks = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I', 'J', 
    'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T'
  ]

  const campusLocations = [
    'TT Block', 'SJT Block', 'MB', 'PRP', 'GDN', 
    'Central Library', 'SMV', 'Academic Block'
  ]

  const calculateDistance = () => {
    // Mock distance calculation
    return Math.random() * 2 + 0.5 // 0.5 to 2.5 km
  }

  const calculateSuggestedTip = (distance: number) => {
    return Math.round(distance * 20) // ₹20 per km as base
  }

  const distance = calculateDistance()
  const suggestedTip = calculateSuggestedTip(distance)

  const handleNext = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1)
    }
  }

  const handlePrevious = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1)
    }
  }

  const handleSubmit = async () => {
    setLoading(true)
    try {
      // TODO: Submit order request to Supabase
      await new Promise(resolve => setTimeout(resolve, 1500))
      
      toast({
        title: "Request Posted!",
        description: "Your order request has been posted. Waiting for a deliverer."
      })
      
      navigate('/my-orders')
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to post request. Please try again.",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
    }
  }

  const isStepValid = () => {
    switch (currentStep) {
      case 1: return formData.restaurant !== ''
      case 2: return formData.orderDescription.length > 10
      case 3: 
        if (formData.locationType === 'hostels') {
          return formData.hostelType !== '' && formData.block !== ''
        }
        return formData.campusLocation !== ''
      case 4: return true
      default: return false
    }
  }

  const renderStepContent = () => {
    switch (currentStep) {
      case 1:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-lg font-semibold">Select Restaurant</Label>
              <p className="text-muted-foreground mb-4">Where would you like to order from?</p>
            </div>
            
            <div className="space-y-3">
              {restaurants.map((restaurant) => (
                <Card
                  key={restaurant.id}
                  className={`cursor-pointer transition-all ${
                    formData.restaurant === restaurant.id 
                      ? 'ring-2 ring-primary bg-primary/5' 
                      : 'hover:bg-muted/50'
                  }`}
                  onClick={() => setFormData({...formData, restaurant: restaurant.id})}
                >
                  <CardContent className="flex items-center justify-between p-4">
                    <div className="flex items-center space-x-3">
                      <span className="text-2xl">{restaurant.icon}</span>
                      <span className="font-medium">{restaurant.name}</span>
                    </div>
                    {formData.restaurant === restaurant.id && (
                      <div className="bg-primary text-primary-foreground px-2 py-1 rounded text-sm">
                        Selected
                      </div>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        )

      case 2:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-lg font-semibold">Describe Your Order</Label>
              <p className="text-muted-foreground mb-4">What would you like to order?</p>
            </div>
            
            <Textarea
              placeholder="E.g., 2x Chicken Burger, 1x Large Fries, 2x Coke..."
              value={formData.orderDescription}
              onChange={(e) => setFormData({...formData, orderDescription: e.target.value})}
              className="min-h-32"
              maxLength={500}
            />
            
            <div className="flex justify-between text-sm text-muted-foreground">
              <span>Be specific about quantities and preferences</span>
              <span>{formData.orderDescription.length}/500</span>
            </div>
          </div>
        )

      case 3:
        return (
          <div className="space-y-4">
            <div>
              <Label className="text-lg font-semibold">Select Location</Label>
              <p className="text-muted-foreground mb-4">Where should the order be delivered?</p>
            </div>

            {/* Location Type Selection */}
            <div className="grid grid-cols-2 gap-3 mb-4">
              <Card
                className={`cursor-pointer transition-all ${
                  formData.locationType === 'hostels' 
                    ? 'ring-2 ring-primary bg-primary/5' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setFormData({...formData, locationType: 'hostels', campusLocation: ''})}
              >
                <CardContent className="flex items-center justify-center p-4">
                  <div className="text-center">
                    <div className="text-2xl mb-2">🏠</div>
                    <div className="font-medium">Hostels</div>
                  </div>
                </CardContent>
              </Card>

              <Card
                className={`cursor-pointer transition-all ${
                  formData.locationType === 'campus' 
                    ? 'ring-2 ring-primary bg-primary/5' 
                    : 'hover:bg-muted/50'
                }`}
                onClick={() => setFormData({...formData, locationType: 'campus', hostelType: '', block: ''})}
              >
                <CardContent className="flex items-center justify-center p-4">
                  <div className="text-center">
                    <div className="text-2xl mb-2">🏛️</div>
                    <div className="font-medium">Campus Locations</div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Hostel Selection */}
            {formData.locationType === 'hostels' && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-3">
                  <Card
                    className={`cursor-pointer transition-all ${
                      formData.hostelType === 'mens' 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setFormData({...formData, hostelType: 'mens', block: ''})}
                  >
                    <CardContent className="flex items-center justify-center p-3">
                      <div className="text-center">
                        <div className="text-xl mb-1">👨</div>
                        <div className="text-sm font-medium">Men's Hostels</div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card
                    className={`cursor-pointer transition-all ${
                      formData.hostelType === 'ladies' 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setFormData({...formData, hostelType: 'ladies', block: ''})}
                  >
                    <CardContent className="flex items-center justify-center p-3">
                      <div className="text-center">
                        <div className="text-xl mb-1">👩</div>
                        <div className="text-sm font-medium">Ladies Hostels</div>
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {formData.hostelType && (
                  <div>
                    <Label className="text-sm font-medium mb-2 block">Select Block</Label>
                    <div className="grid grid-cols-5 gap-2">
                      {hostelBlocks.map((block) => (
                        <Button
                          key={block}
                          variant={formData.block === block ? "default" : "outline"}
                          onClick={() => setFormData({...formData, block})}
                          className="h-10"
                        >
                          {block}
                        </Button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Campus Location Selection */}
            {formData.locationType === 'campus' && (
              <div className="space-y-3">
                {campusLocations.map((location) => (
                  <Card
                    key={location}
                    className={`cursor-pointer transition-all ${
                      formData.campusLocation === location 
                        ? 'ring-2 ring-primary bg-primary/5' 
                        : 'hover:bg-muted/50'
                    }`}
                    onClick={() => setFormData({...formData, campusLocation: location})}
                  >
                    <CardContent className="flex items-center justify-between p-4">
                      <span className="font-medium">{location}</span>
                      {formData.campusLocation === location && (
                        <div className="bg-primary text-primary-foreground px-2 py-1 rounded text-sm">
                          Selected
                        </div>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )

      case 4:
        return (
          <div className="space-y-6">
            <div>
              <Label className="text-lg font-semibold">Set Tip Amount</Label>
              <p className="text-muted-foreground">Distance: {distance.toFixed(1)}km → Suggested tip: ₹{suggestedTip}</p>
            </div>

            <Card>
              <CardContent className="p-6">
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium">Tip Amount</span>
                    <span className="text-lg font-bold">₹{formData.tip[0]}</span>
                  </div>
                  
                  <Slider
                    value={formData.tip}
                    onValueChange={(value) => setFormData({...formData, tip: value})}
                    max={200}
                    min={10}
                    step={5}
                    className="w-full"
                  />
                  
                  <div className="flex justify-between text-sm text-muted-foreground">
                    <span>₹10</span>
                    <span>₹200</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <h3 className="font-semibold mb-3">Order Summary</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span>Restaurant:</span>
                    <span className="font-medium">
                      {restaurants.find(r => r.id === formData.restaurant)?.name}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Location:</span>
                    <span className="font-medium">
                      {formData.locationType === 'hostels' 
                        ? `${formData.hostelType === 'mens' ? "Men's" : "Ladies"} Hostel ${formData.block}`
                        : formData.campusLocation
                      }
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Distance:</span>
                    <span className="font-medium">{distance.toFixed(1)} km</span>
                  </div>
                  <div className="flex justify-between">
                    <span>Tip:</span>
                    <span className="font-medium">₹{formData.tip[0]}</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )

      default:
        return null
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <Header />
      
      <main className="container mx-auto px-4 py-6 pb-20 md:pb-6">
        {/* Progress Indicator */}
        <div className="mb-8">
          <div className="flex items-center justify-center space-x-4 mb-4">
            {[1, 2, 3, 4].map((step) => (
              <div
                key={step}
                className={`flex items-center justify-center w-8 h-8 rounded-full text-sm font-medium ${
                  step === currentStep
                    ? 'bg-primary text-primary-foreground'
                    : step < currentStep
                    ? 'bg-success text-success-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {step}
              </div>
            ))}
          </div>
          <p className="text-center text-sm text-muted-foreground">
            Step {currentStep} of 4
          </p>
        </div>

        {/* Form Content */}
        <Card className="max-w-2xl mx-auto">
          <CardContent className="p-6">
            {renderStepContent()}
          </CardContent>
        </Card>

        {/* Navigation Buttons */}
        <div className="flex justify-between max-w-2xl mx-auto mt-6">
          <Button
            variant="outline"
            onClick={handlePrevious}
            disabled={currentStep === 1}
          >
            <ChevronLeft className="h-4 w-4 mr-2" />
            Previous
          </Button>

          {currentStep < 4 ? (
            <Button
              onClick={handleNext}
              disabled={!isStepValid()}
              className="btn-campus-primary"
            >
              Next
              <ChevronRight className="h-4 w-4 ml-2" />
            </Button>
          ) : (
            <Button
              onClick={handleSubmit}
              disabled={loading || !isStepValid()}
              className="btn-campus-primary"
            >
              {loading ? 'Posting...' : 'Post My Request'}
            </Button>
          )}
        </div>
      </main>

      <MobileNav />
      <SupportChat />
    </div>
  )
}

export default PostRequest